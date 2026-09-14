import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, DEFAULT_VIEW, captionFor, visibilityPlan } from "./globe-state";

/**
 * Gate for Phase 1 (handoff §83): all four combinations must produce the right
 * visibility plan before any map layer work starts, so a later rendering bug
 * cannot be mistaken for a state bug.
 */
describe("globe visibility plan", () => {
  it("World + Journey keeps today's default experience (§55.1)", () => {
    expect(visibilityPlan("world", "journey")).toEqual({
      journeyLayers: true,
      journeySelector: true,
      worldAdmin: false,
      chinaAdmin: false,
      chinaAuthority: false,
    });
  });

  it("China + Journey adds only the China Authority Boundary (§55.2)", () => {
    expect(visibilityPlan("china", "journey")).toEqual({
      journeyLayers: true,
      journeySelector: true,
      worldAdmin: false,
      chinaAdmin: false,
      chinaAuthority: true,
    });
  });

  it("World + Footprint swaps journey for the world admin fill (§55.3)", () => {
    expect(visibilityPlan("world", "footprint")).toEqual({
      journeyLayers: false,
      journeySelector: false,
      worldAdmin: true,
      chinaAdmin: false,
      chinaAuthority: false,
    });
  });

  it("China + Footprint shows province fill plus the Authority Boundary (§55.4)", () => {
    expect(visibilityPlan("china", "footprint")).toEqual({
      journeyLayers: false,
      journeySelector: false,
      worldAdmin: false,
      chinaAdmin: true,
      chinaAuthority: true,
    });
  });
});

describe("Scope and View independence (§8, §73, §74)", () => {
  it("hides journey layers and the selector in Footprint, in both scopes", () => {
    for (const scope of ["world", "china"] as const) {
      const plan = visibilityPlan(scope, "footprint");
      expect(plan.journeyLayers).toBe(false);
      expect(plan.journeySelector).toBe(false);
    }
  });

  it("keeps journey layers and the selector in Journey, in both scopes", () => {
    for (const scope of ["world", "china"] as const) {
      const plan = visibilityPlan(scope, "journey");
      expect(plan.journeyLayers).toBe(true);
      expect(plan.journeySelector).toBe(true);
    }
  });

  it("ties the China Authority Boundary to Scope only, never View", () => {
    expect(visibilityPlan("china", "journey").chinaAuthority).toBe(true);
    expect(visibilityPlan("china", "footprint").chinaAuthority).toBe(true);
    expect(visibilityPlan("world", "journey").chinaAuthority).toBe(false);
    expect(visibilityPlan("world", "footprint").chinaAuthority).toBe(false);
  });

  it("never enables both admin fills at once", () => {
    for (const scope of ["world", "china"] as const) {
      for (const view of ["journey", "footprint"] as const) {
        const plan = visibilityPlan(scope, view);
        expect(plan.worldAdmin && plan.chinaAdmin).toBe(false);
      }
    }
  });

  it("shows an admin fill only in Footprint", () => {
    expect(visibilityPlan("world", "journey").worldAdmin).toBe(false);
    expect(visibilityPlan("china", "journey").chinaAdmin).toBe(false);
  });
});

describe("globe defaults", () => {
  it("opens on the existing homepage experience (§3)", () => {
    expect(DEFAULT_SCOPE).toBe("world");
    expect(DEFAULT_VIEW).toBe("journey");
    expect(visibilityPlan(DEFAULT_SCOPE, DEFAULT_VIEW)).toEqual({
      journeyLayers: true,
      journeySelector: true,
      worldAdmin: false,
      chinaAdmin: false,
      chinaAuthority: false,
    });
  });

  it("labels each view", () => {
    expect(captionFor("journey")).toContain("sequence");
    expect(captionFor("footprint")).toContain("footprint");
  });
});
