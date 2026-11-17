/* Identificación del movilizador y cierre de sesión.
   Script independiente (no forma parte de dist/): funciona con cualquier versión compilada del portal. */
(function () {
  var portal = document.getElementById("portal-screen");
  var workflow = document.getElementById("mobilizer-workflow-screen");
  var bar = document.getElementById("mobilizer-bar");
  if (!portal || !bar) return;
  var csrf = "";

  function text(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function load() {
    return fetch("api.php?action=session", { credentials: "same-origin" })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data || !data.user) return null;
        csrf = data.csrf || "";
        var user = data.user;
        var initials = String(user.name || "").trim().split(/\s+/).slice(0, 2)
          .map(function (part) { return part.charAt(0); }).join("").toUpperCase();
        var state = user.territoryName ? "Estado " + user.territoryName : "Sin estado asignado";
        text("bar-avatar", initials || "US");
        text("bar-name", user.name || "Usuario");
        text("bar-state", state);
        text("workflow-user-name", user.name || "Usuario");
        text("workflow-user-state", state);
        return user;
      })
      .catch(function () { return null; });
  }

  function logout() {
    var button = document.getElementById("identity-logout");
    if (button) button.disabled = true;
    var send = function () {
      return fetch("api.php?action=logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
        body: "{}"
      });
    };
    (csrf ? Promise.resolve() : load()).then(send).then(function () {
      window.location.reload();
    }).catch(function () {
      window.location.reload();
    });
  }

  var button = document.getElementById("identity-logout");
  if (button) button.addEventListener("click", logout);
  var workflowButton = document.getElementById("identity-logout-workflow");
  if (workflowButton) workflowButton.addEventListener("click", logout);

  var observer = new MutationObserver(function () {
    if (!portal.hidden || (workflow && !workflow.hidden)) load();
  });
  observer.observe(portal, { attributes: true, attributeFilter: ["hidden"] });
  if (workflow) observer.observe(workflow, { attributes: true, attributeFilter: ["hidden"] });
  if (!portal.hidden || (workflow && !workflow.hidden)) load();
})();
