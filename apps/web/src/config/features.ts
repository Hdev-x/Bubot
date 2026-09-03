/** Portfolio Beta에서 노출하는 제품 기능 경계. 보관 코드는 삭제하지 않고 진입점만 닫는다. */
export const BETA_FEATURES = {
  trading: true,
  strategy: true,
  paperTrading: false,
  community: false,
  push: false,
  admin: false,
  indicators: true,
  socialAuth: false,
  mobileSignup: false,
} as const;
