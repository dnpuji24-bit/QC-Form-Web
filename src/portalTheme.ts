import type { ThemeConfig } from 'antd'

export const portalTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1d4ed8',
    colorSuccess: '#15803d',
    colorWarning: '#b45309',
    colorError: '#b91c1c',
    colorText: '#0f172a',
    colorTextSecondary: '#475569',
    colorBgLayout: '#f3f6fb',
    borderRadius: 8,
    controlHeight: 40,
    fontFamily: 'Inter, system-ui, "Segoe UI", sans-serif',
  },
  components: {
    Card: { bodyPadding: 20 },
    Layout: { headerBg: '#fff' },
    Table: { headerBg: '#f1f5f9' },
    Notification: { zIndexPopup: 10020 },
  },
}
