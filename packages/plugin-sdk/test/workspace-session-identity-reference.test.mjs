import { describe, expect, it, vi } from "vitest";
import {
  mount,
  profileView,
  signOutWithConfirmation,
} from "../reference/workspace-session-identity.mjs";

function context({ email, session, confirmed = true } = {}) {
  return {
    actor: {
      id: "user-1",
      displayName: "Asha Rao",
      ...(email === undefined ? {} : { email }),
      role: "operator",
      access: {},
    },
    confirmation: { confirm: vi.fn(async () => confirmed) },
    notifications: { show: vi.fn() },
    ...(session === undefined ? {} : { session }),
  };
}

// Just enough of a DOM for the reference panel: elements with children, text,
// a disabled flag and click listeners.
function fakeTarget() {
  const element = (tag) => {
    const node = {
      tag,
      children: [],
      textContent: "",
      disabled: false,
      listeners: {},
      append: (...items) => node.children.push(...items),
      remove: vi.fn(),
      addEventListener: (type, listener) => (node.listeners[type] = listener),
    };
    return node;
  };
  const target = element("div");
  target.ownerDocument = { createElement: element };
  return target;
}

describe("workspace session identity reference", () => {
  it("shows the name, the email when supplied, and sign-out availability", () => {
    expect(
      profileView(
        context({ email: "asha@example.test", session: { signOut: vi.fn() } }),
      ),
    ).toEqual({
      name: "Asha Rao",
      email: "asha@example.test",
      canSignOut: true,
    });
    expect(profileView(context())).toEqual({
      name: "Asha Rao",
      email: null,
      canSignOut: false,
    });
  });

  it("asks the host to sign out only after confirmation", async () => {
    const signOut = vi.fn(async () => undefined);
    const declined = context({ session: { signOut }, confirmed: false });
    await expect(signOutWithConfirmation(declined, "Sign out?")).resolves.toBe(
      "cancelled",
    );
    expect(signOut).not.toHaveBeenCalled();
    const accepted = context({ session: { signOut } });
    await expect(signOutWithConfirmation(accepted, "Sign out?")).resolves.toBe(
      "signing-out",
    );
    expect(accepted.confirmation.confirm).toHaveBeenCalledWith("Sign out?");
    expect(signOut).toHaveBeenCalledOnce();
    const unavailable = context();
    await expect(
      signOutWithConfirmation(unavailable, "Sign out?"),
    ).resolves.toBe("unavailable");
    expect(unavailable.confirmation.confirm).not.toHaveBeenCalled();
  });

  it("propagates a host refusal", async () => {
    const refused = context({
      session: {
        signOut: vi.fn(async () => Promise.reject(new Error("no gesture"))),
      },
    });
    await expect(signOutWithConfirmation(refused, "Sign out?")).rejects.toThrow(
      "no gesture",
    );
  });

  it("renders the panel and keeps the button disabled while signing out", async () => {
    const target = fakeTarget();
    const signOut = vi.fn(async () => undefined);
    const mounted = mount(
      target,
      context({ email: "asha@example.test", session: { signOut } }),
    );
    const [list, button] = target.children;
    expect(list.children.map((node) => node.textContent)).toEqual([
      "Name",
      "Asha Rao",
      "Email",
      "asha@example.test",
    ]);
    await button.listeners.click();
    expect(signOut).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    mounted.destroy();
    expect(list.remove).toHaveBeenCalled();
    expect(button.remove).toHaveBeenCalled();
  });

  it("re-enables the button and reports a failed sign-out", async () => {
    const target = fakeTarget();
    const failing = context({
      session: {
        signOut: vi.fn(async () => Promise.reject(new Error("refused"))),
      },
    });
    mount(target, failing);
    const button = target.children[1];
    await button.listeners.click();
    expect(button.disabled).toBe(false);
    expect(failing.notifications.show).toHaveBeenCalledWith({
      type: "error",
      message: "Sign out failed. Try again.",
    });
  });

  it("omits the button when the host offers no session service", () => {
    const target = fakeTarget();
    mount(target, context());
    expect(target.children).toHaveLength(1);
    expect(target.children[0].children[3].textContent).toBe("—");
  });
});
