const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const isFilePreview = window.location.protocol === "file:";
const defaultApiBase = isLocalHost || isFilePreview ? "http://127.0.0.1:4000" : window.location.origin;
const defaultSocketUrl = isLocalHost || isFilePreview ? "http://127.0.0.1:4000" : "";

window.APP_CONFIG = {
  API_BASE_URL: defaultApiBase,
  SOCKET_URL: defaultSocketUrl,
  ROUTING_API_BASE_URL: "https://router.project-osrm.org/route/v1/driving",
};
