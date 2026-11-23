import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { migrate } from '../lib/db';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="checklist.db" onInit={migrate}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Checklist' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Produto' }} />
      </Stack>
    </SQLiteProvider>
  );
}
