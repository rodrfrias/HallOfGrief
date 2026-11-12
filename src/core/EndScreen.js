/* Pantalla final: se funde a un blanco cálido y muestra el agradecimiento.
   Para sumar frases finales, agregarlas al array END_LINES: cada final muestra una distinta. */
export const END_LINES = [
  "Lo que fue, sigue creciendo.",
  // "Se puede extrañar y seguir.",
  // "No se va. Cambia de lugar.",
];

// Para el final, revisar
export const END_CONFIG = {
  resources: [], // por ejemplo: [{ label: "Línea de apoyo ...", detail: "número o enlace" }]
  feedbackUrl: "", // enlace a un formulario con las preguntas abiertas del plan de pruebas
};

export function showEndScreen({
  lines = END_LINES,
  resources = END_CONFIG.resources,
  feedbackUrl = END_CONFIG.feedbackUrl,
} = {}) {
  document.getElementById("crosshair")?.style.setProperty("display", "none");
  document.getElementById("ui-prompt")?.style.setProperty("display", "none");

  // 1) Fundido a blanco cálido (viene de la sala más luminosa, no de un negro)
  const fade = document.createElement("div");
  fade.style.cssText =
    "position:fixed;inset:0;background:#fbf3dc;opacity:0;transition:opacity 3s ease-in-out;z-index:200;pointer-events:none;";
  document.body.appendChild(fade);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => (fade.style.opacity = "1")),
  );

  // 2) Pantalla de agradecimiento
  setTimeout(() => {
    const screen = document.createElement("div");
    screen.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fbf3dc;color:#3b2f22;z-index:201;opacity:0;transition:opacity 2s ease-in-out;padding:1.5rem;";
    const box = document.createElement("div");
    box.style.cssText =
      "max-width:520px;text-align:center;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.55;";

    const title = document.createElement("h1");
    title.textContent = "Gracias por recorrer este espacio";
    title.style.cssText =
      "font-size:1.7rem;letter-spacing:0.08rem;margin-bottom:1.4rem;color:#3b2f22;";

    const line = document.createElement("p");
    line.textContent = lines[Math.floor(Math.random() * lines.length)];
    line.style.cssText =
      "font-size:1.35rem;font-style:italic;margin-bottom:1.6rem;color:#6a4a2a;";

    const note = document.createElement("p");
    note.textContent =
      "Este recorrido es una simplificación: en la vida real las etapas del duelo no son lineales, no son pasos ordenados y cada persona puede ir y volver entre etapas.";
    note.style.cssText = "font-size:0.9rem;margin-bottom:1.4rem;color:#7a6a58;";

    box.append(title, line, note);

    if (resources.length) {
      const list = document.createElement("ul");
      list.style.cssText =
        "list-style:none;font-size:0.9rem;margin-bottom:1.2rem;color:#5a4a38;";
      resources.forEach((r) => {
        const li = document.createElement("li");
        li.textContent = r.detail ? `${r.label}: ${r.detail}` : r.label;
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    if (feedbackUrl) {
      const a = document.createElement("a");
      a.href = feedbackUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Contanos cómo fue (opcional)";
      a.style.cssText =
        "display:block;margin-bottom:1.4rem;font-size:0.95rem;color:#6a4a2a;";
      box.appendChild(a);
    }

    const again = document.createElement("button");
    again.textContent = "Volver a empezar";
    again.style.cssText =
      "background:#d9c9a3;color:#3b2f22;padding:0.7rem 1.6rem;font-size:1rem;border:0;border-radius:4px;cursor:pointer;";
    again.onclick = () => location.reload();
    box.appendChild(again);

    const foot = document.createElement("p");
    foot.textContent =
      "Hall of Grief · Creatividad y Desarrollo de Entornos Virtuales · UTN FRC · Grupo 9";
    foot.style.cssText = "margin-top:2rem;font-size:0.75rem;color:#a39580;";
    box.appendChild(foot);

    screen.appendChild(box);
    document.body.appendChild(screen);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (screen.style.opacity = "1")),
    );
  }, 3200);
}
