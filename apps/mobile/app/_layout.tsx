import { Stack } from "expo-router";
import { darkTheme } from "@kito/config";

/**
 * Listener app shell (Phase 3).
 * The five destinations (Home, Radio, Podcasts, Watch, My Library) are
 * implemented in Phase 3; this file only establishes the navigator and theme.
 */
export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: darkTheme.surface },
        headerTintColor: darkTheme.text,
        contentStyle: { backgroundColor: darkTheme.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Home" }} />
    </Stack>
  );
}
