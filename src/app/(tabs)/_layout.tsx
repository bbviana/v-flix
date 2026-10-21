import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explorar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
