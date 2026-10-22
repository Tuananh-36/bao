/**
 * Chuẩn hóa một trang bài viết Dân Trí trong trình duyệt.
 * Dùng trong console/bookmarklet tại dantri.com.vn để cùng origin fetch không bị CORS.
 * Trả về object theo schema yêu cầu; giữ nguyên văn bản bài, không tự viết lại.
 */
async function getDanTriArticle(articleUrl) {
  const url = new URL(articleUrl, location.href).href;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Không tải được ${url}: HTTP ${response.status}`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const meta = (selector) => doc.querySelector(selector)?.content || "";
  const jsonLd = [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((el) => { try { const v = JSON.parse(el.textContent); return Array.isArray(v) ? v : [v]; } catch { return []; } });
  const articleLd = jsonLd.flatMap((v) => v['@graph'] || [v])
    .find((v) => /Article|NewsArticle/i.test(v['@type'] || "")) || {};
  const title = clean(articleLd.headline || meta('meta[property="og:title"]') || doc.querySelector("h1")?.textContent);
  const contentNode = doc.querySelector(".singular-content, .e-magazine__body, .dt-news__content, article");
  const content = clean(contentNode?.innerText || articleLd.articleBody || "");
  const excerpt = clean(articleLd.description || meta('meta[name="description"]') || meta('meta[property="og:description"]'));
  const authorValue = articleLd.author;
  const author = Array.isArray(authorValue)
    ? authorValue.map((x) => clean(typeof x === "string" ? x : x.name)).filter(Boolean)
    : authorValue ? clean(typeof authorValue === "string" ? authorValue : authorValue.name) : "";
  const category = [...doc.querySelectorAll('meta[property="article:section"], .dt-news__tag a, .breadcrumb a')]
    .map((x) => clean(x.content || x.textContent)).filter(Boolean);
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop()?.replace(/\.htm$/, "") || "";
  return {
    id: String(articleLd.identifier || meta('meta[property="article:id"]') || slug),
    title,
    slug,
    excerpt,
    content,
    author,
    category: [...new Set(category)].join(" / "),
    publishedAt: articleLd.datePublished || meta('meta[property="article:published_time"]') || "",
    source: "Dân trí",
    url
  };
}

// Ví dụ:
// const article = await getDanTriArticle("https://dantri.com.vn/...htm");
// console.log(JSON.stringify(article, null, 2));

/** Thu thập tối đa 10 bài từ mỗi mục trong menu; chạy tại dantri.com.vn.
 * Trả về { menu, postsByCategory }; bỏ qua các bài không đọc được và ghi lỗi riêng.
 */
async function collectDanTriMenu(menu, perCategory = 10) {
  const entries = menu.flatMap((item) => [item, ...(item.children || [])])
    .filter((item) => item.type !== "home" && item.type !== "external");
  const result = { collectedAt: new Date().toISOString(), postsByCategory: {}, errors: [] };
  for (const category of entries) {
    try {
      const page = await fetch(category.url, { credentials: "include" });
      if (!page.ok) throw new Error(`HTTP ${page.status}`);
      const doc = new DOMParser().parseFromString(await page.text(), "text/html");
      const articleUrls = [...new Set([...doc.querySelectorAll('a[href$=".htm"]')]
        .map((a) => new URL(a.getAttribute("href"), category.url).href)
        .filter((u) => u.startsWith("https://dantri.com.vn/") &&
          !u.includes("/tin-moi-nhat.htm") &&
          !u.endsWith(new URL(category.url).pathname)))].slice(0, perCategory);
      const posts = [];
      for (const url of articleUrls) {
        try { posts.push(await getDanTriArticle(url)); }
        catch (e) { result.errors.push({ category: category.id, url, error: String(e) }); }
      }
      result.postsByCategory[category.id] = posts;
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (e) {
      result.postsByCategory[category.id] = [];
      result.errors.push({ category: category.id, url: category.url, error: String(e) });
    }
  }
  return result;
}

// Ví dụ lưu JSON (mở devtools tại dantri.com.vn):
// const data = await collectDanTriMenu(menuData.menu, 10);
// copy(JSON.stringify(data, null, 2));

