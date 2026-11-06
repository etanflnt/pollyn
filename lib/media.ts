// Turn a pasted video link into an embeddable iframe src. Owner: orchestrator.
// Supports YouTube, Vimeo, Loom, Microsoft Stream (SharePoint) and direct .mp4/.webm files.

export type VideoEmbed = { type: "iframe"; src: string } | { type: "file"; src: string } | null;

export function toVideoEmbed(raw: string): VideoEmbed {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: "file", src: url.toString() };

  if (host === "youtu.be") return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}` };
  if (host.endsWith("youtube.com")) {
    const id = url.searchParams.get("v") ?? url.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/)?.[2];
    return id ? { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host.endsWith("vimeo.com")) {
    const id = url.pathname.match(/(\d+)/)?.[1];
    return id ? { type: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host.endsWith("loom.com")) {
    const id = url.pathname.match(/\/(share|embed)\/([^/?]+)/)?.[2];
    return id ? { type: "iframe", src: `https://www.loom.com/embed/${id}` } : null;
  }
  if (host.endsWith("sharepoint.com") || host.endsWith("microsoftstream.com")) {
    // Stream on SharePoint: the share link works as an embed when ?embed is appended.
    const u = new URL(url.toString());
    if (!u.pathname.includes("embed.aspx")) u.searchParams.set("embed", "{}");
    return { type: "iframe", src: u.toString() };
  }
  return null;
}

export function isValidHttpUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
