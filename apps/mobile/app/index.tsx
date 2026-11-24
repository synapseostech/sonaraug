import { Text, View } from "react-native";
import { brand, darkTheme } from "@kito/config";

export default function Home() {
  return (
    <View style={{ flex: 1, backgroundColor: darkTheme.bg, padding: 24, justifyContent: "center" }}>
      <Text style={{ color: brand.accent, fontSize: 12, letterSpacing: 2 }}>FOUNDATION BUILD</Text>
      <Text style={{ color: darkTheme.text, fontSize: 32, fontWeight: "700" }}>{brand.name}</Text>
      <Text style={{ color: darkTheme.textMuted, fontSize: 16, marginTop: 8 }}>{brand.tagline}</Text>
      <Text style={{ color: darkTheme.textMuted, marginTop: 32, fontSize: 13 }}>
        Listener experience not implemented yet (Phase 3).
      </Text>
    </View>
  );
}
