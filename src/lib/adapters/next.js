// Next.js (App Router) adapter.
//
// A "surface" is a regulation-level concept (a sign-up flow, a child profile, a
// chat box). Rule packs reference surfaces by alias; this adapter knows how those
// aliases map onto files in a Next App Router codebase. Packs stay portable: only
// the adapter is stack-specific, exactly like tieline's client/server adapters.

export const id = "next";

// Files this adapter considers source. Other files are ignored when scanning.
export const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

// Surface alias -> globs (relative to the repo root). Globs support **, *, ?, {a,b}.
// These are deliberately broad: a missed surface yields "unknown" (honest), never a
// false "pass". Tune per project via pack rules that pass explicit `in` globs.
export const SURFACES = {
  any: ["**/*.{ts,tsx,js,jsx}"],

  signup: [
    "**/{sign-up,signup,register,registration,onboarding,create-account}/**/*.{ts,tsx}",
    "**/*{SignUp,Signup,Register,Onboard}*.{ts,tsx}",
  ],

  auth: [
    "**/{auth,login,sign-in,signin}/**/*.{ts,tsx}",
    "**/*{Login,SignIn,Auth}*.{ts,tsx}",
  ],

  profile: [
    "**/{profile,account,settings,me}/**/*.{ts,tsx}",
    "**/*{Profile,Account,Settings}*.{ts,tsx}",
  ],

  chat: [
    "**/{chat,messages,messaging,dm,inbox}/**/*.{ts,tsx}",
    "**/*{Chat,Message,Messaging,Conversation}*.{ts,tsx}",
  ],

  livestream: [
    "**/{livestream,live,stream,meet,broadcast,call}/**/*.{ts,tsx}",
    "**/*{Livestream,LiveStream,Stream,Broadcast,Meeting,Viewer}*.{ts,tsx}",
  ],

  // Any user-generated-content surface (the union of the live/social surfaces).
  ugc: [
    "**/{chat,messages,messaging,dm,inbox,livestream,live,stream,meet,broadcast,comments,reviews}/**/*.{ts,tsx}",
    "**/*{Chat,Message,Comment,Review,Stream,Broadcast,Profile,Event}*.{ts,tsx}",
  ],

  // Documentation / governance artifacts (DPIA, risk assessments, policies).
  governance: [
    "**/*{dpia,DPIA,data-protection,risk-assessment,risk_assessment}*",
    "{docs,compliance,legal,governance}/**/*.{md,mdx,pdf}",
  ],
};

/** Resolve a rule's `in` (alias string, alias array, or raw glob array) into a flat glob list. */
export function resolveSurface(spec) {
  const list = Array.isArray(spec) ? spec : [spec];
  const globs = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    if (SURFACES[item]) globs.push(...SURFACES[item]);
    else globs.push(item); // treat as a raw glob
  }
  return globs.length ? globs : SURFACES.any;
}
