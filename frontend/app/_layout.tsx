import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F8F7F4' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="patient" />
        <Stack.Screen name="doctor" />
        <Stack.Screen name="doctor-profile/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="tracking/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="prescription/[visitId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="invoice/[visitId]" options={{ presentation: 'card' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
