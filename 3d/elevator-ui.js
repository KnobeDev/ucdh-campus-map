// Floor picker for elevators and stairs: a native <dialog>, so focus trapping,
// Escape-to-close and the dialog role come from the platform. Every choice is a
// real button with the floor name as its visible text (voice control can say
// "click Level 5"). Nothing here moves the player; it only reports the choice.
export function createFloorPicker({ onChoose, onCancel }) {
  const dialog = document.getElementById("floor-dialog");
  const title = document.getElementById("floor-dialog-title");
  const hint = document.getElementById("floor-dialog-hint");
  const list = document.getElementById("floor-dialog-list");
  const cancel = document.getElementById("floor-dialog-cancel");

  let closing = false;
  cancel.addEventListener("click", () => dialog.close("cancel"));
  dialog.addEventListener("close", () => {
    if (!closing) onCancel?.();
    closing = false;
  });

  return {
    /**
     * @param {object} opts
     * @param {string} opts.title       e.g. "Main elevators"
     * @param {Array}  opts.floors      [{ id, name, current }]
     * @param {string} [opts.hint]
     */
    open({ title: t, floors, hint: h }) {
      if (dialog.open) return; // showModal() on an open dialog throws; a double-tap must not
      title.textContent = t;
      hint.textContent = h || "";
      list.replaceChildren();
      for (const f of floors) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = f.name;
        if (f.current) {
          btn.disabled = true;
          btn.setAttribute("aria-label", `${f.name} (you are here)`);
        }
        btn.addEventListener("click", () => {
          if (!dialog.open) return; // a stale button from an earlier, already-closed picker
          closing = true;
          dialog.close(f.id);
          onChoose(f.id);
        });
        li.append(btn);
        list.append(li);
      }
      dialog.showModal();
      // Focus the first enabled choice so keyboard users land on a real option.
      list.querySelector("button:not([disabled])")?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
}
