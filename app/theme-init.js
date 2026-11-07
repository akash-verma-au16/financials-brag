// Resolve the theme before first paint to avoid a flash. Kept as a file (not inline) so the CSP can forbid inline scripts.
try {
  var pref = localStorage.getItem("theme");
  var dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch (e) {
  document.documentElement.dataset.theme = "light";
}
