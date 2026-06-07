// React Native (Expo / bare) adapter.
//
// Same surface model as the Next adapter, but globs tuned for a typical RN/Expo
// app layout (screens/, src/screens, app/ for expo-router, components/). Packs are
// unchanged — only this file is stack-specific.

export const id = "react-native";

export const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx"];

export const SURFACES = {
  any: ["**/*.{ts,tsx,js,jsx}"],

  signup: [
    "**/{sign-up,signup,register,registration,onboarding,create-account}/**/*.{ts,tsx,js,jsx}",
    "**/*{SignUp,Signup,Register,Onboard}*.{ts,tsx,js,jsx}",
  ],

  auth: [
    "**/{auth,login,sign-in,signin}/**/*.{ts,tsx,js,jsx}",
    "**/*{Login,SignIn,Auth}*Screen*.{ts,tsx,js,jsx}",
    "**/*{Login,SignIn,Auth}*.{ts,tsx,js,jsx}",
  ],

  profile: [
    "**/{profile,account,settings,me}/**/*.{ts,tsx,js,jsx}",
    "**/*{Profile,Account,Settings}*Screen*.{ts,tsx,js,jsx}",
    "**/*{Profile,Account,Settings}*.{ts,tsx,js,jsx}",
  ],

  chat: [
    "**/{chat,messages,messaging,dm,inbox}/**/*.{ts,tsx,js,jsx}",
    "**/*{Chat,Message,Messaging,Conversation}*.{ts,tsx,js,jsx}",
  ],

  livestream: [
    "**/{livestream,live,stream,meet,broadcast,call}/**/*.{ts,tsx,js,jsx}",
    "**/*{Livestream,LiveStream,Stream,Broadcast,Meeting,Viewer}*.{ts,tsx,js,jsx}",
  ],

  ugc: [
    "**/{chat,messages,messaging,dm,inbox,livestream,live,stream,meet,broadcast,comments,reviews}/**/*.{ts,tsx,js,jsx}",
    "**/*{Chat,Message,Comment,Review,Stream,Broadcast,Profile,Event}*.{ts,tsx,js,jsx}",
  ],

  governance: [
    "**/*{dpia,DPIA,data-protection,risk-assessment,risk_assessment}*",
    "{docs,compliance,legal,governance}/**/*.{md,mdx,pdf}",
  ],
};

export function resolveSurface(spec) {
  const list = Array.isArray(spec) ? spec : [spec];
  const globs = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    if (SURFACES[item]) globs.push(...SURFACES[item]);
    else globs.push(item);
  }
  return globs.length ? globs : SURFACES.any;
}
