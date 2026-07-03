export const tvRoutes = {
  home: () => "/tv/",
  search: () => "/tv/search/",
  library: (id: number) => `/tv/library/?id=${id}`,
  deck: (id: number) => `/tv/library/?deck=${id}`,
  media: (id: number) => `/tv/media/?id=${id}`,
  watch: (type: "movie" | "episode", fileId: number, mediaId?: number) => {
    const params = new URLSearchParams({
      type,
      id: String(fileId),
    });
    if (mediaId) params.set("media", String(mediaId));
    return `/tv/watch/?${params.toString()}`;
  },
};
