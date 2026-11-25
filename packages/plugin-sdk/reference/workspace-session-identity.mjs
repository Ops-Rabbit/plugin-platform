/**
 * Executable reference for workspace signed-in identity and sign-out
 * (docs/workspace-session-identity-v1.md). A native workspace that requests
 * `actor.email.read` and `session.end` shows who is signed in and offers a
 * Sign out control. The host owns the session: the plugin only asks it to end
 * the session and never calls authentication endpoints, reads cookies or
 * clears storage itself.
 */

/**
 * Returns what a profile panel may show. `email` is `null` when the host did
 * not supply it (capability not requested, or an older host); `canSignOut` is
 * false when the host offers no session service.
 */
export function profileView(context) {
  return {
    name: context.actor.displayName,
    email: typeof context.actor.email === "string" ? context.actor.email : null,
    canSignOut: typeof context.session?.signOut === "function",
  };
}

/**
 * Confirms with the user, then asks the host to sign out. Call it from the
 * click handler of the Sign out control so the host sees a user gesture.
 * Returns `"cancelled"` when the user declines, `"unavailable"` when the host
 * offers no session service, and `"signing-out"` once the host accepted the
 * request; the host then navigates to its login page. A rejected host call
 * (for example an unloaded workspace) propagates to the caller.
 */
export async function signOutWithConfirmation(context, message) {
  const session = context.session;
  if (typeof session?.signOut !== "function") return "unavailable";
  if (!(await context.confirmation.confirm(message))) return "cancelled";
  await session.signOut();
  return "signing-out";
}

/** Minimal native workspace module that renders the panel into `target`. */
export function mount(target, context) {
  const view = profileView(context);
  const doc = target.ownerDocument;
  const list = doc.createElement("dl");
  for (const [label, value] of [
    ["Name", view.name],
    ["Email", view.email ?? "—"],
  ]) {
    const term = doc.createElement("dt");
    term.textContent = label;
    const detail = doc.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  }
  target.append(list);
  if (!view.canSignOut) return { destroy: () => list.remove() };
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Sign out";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const outcome = await signOutWithConfirmation(
        context,
        "Sign out of OpsRabbit?",
      );
      // Keep the control disabled while the host navigates away.
      if (outcome !== "signing-out") button.disabled = false;
    } catch {
      button.disabled = false;
      context.notifications.show({
        type: "error",
        message: "Sign out failed. Try again.",
      });
    }
  });
  target.append(button);
  return {
    destroy() {
      list.remove();
      button.remove();
    },
  };
}
