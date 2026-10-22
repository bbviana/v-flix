import type { ConfigContext, ExpoConfig } from 'expo/config';

// Estende o app.json com a data do build, calculada quando a configuração é avaliada
// (no EAS Build, durante o build; no Expo Go, ao iniciar o servidor de desenvolvimento).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: { ...config.extra, buildDate: new Date().toISOString() },
});
