/** Mobile hamburger menu — shared by index and invoices pages. */
export function wireNavMenu() {
  const menuToggle = document.querySelector("#menu-toggle");
  const navMenu = document.querySelector("#nav-menu");
  const navBackdrop = document.querySelector("#nav-menu-backdrop");
  if (!menuToggle || !navMenu) return;

  function openMenu() {
    menuToggle.setAttribute("aria-expanded", "true");
    navMenu.classList.add("open");
    navBackdrop?.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    menuToggle.setAttribute("aria-expanded", "false");
    navMenu.classList.remove("open");
    navBackdrop?.classList.remove("open");
    document.body.style.overflow = "";
  }

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    if (expanded) closeMenu();
    else openMenu();
  });
  navBackdrop?.addEventListener("click", closeMenu);
  navMenu.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) closeMenu();
  });
}