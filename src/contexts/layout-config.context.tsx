import { createContext, PropsWithChildren, useContext, useState } from 'react';

export interface LayoutConfig {
  title?: string;
  backButton?: boolean;
  onBack?: () => void;
  textStart?: boolean;
  noPadding?: boolean;
  noHeader?: boolean;
  noMaxWidth?: boolean;
  smallMenu?: boolean;
}

interface LayoutConfigContextInterface {
  config: LayoutConfig;
  setConfig: (config: LayoutConfig) => void;
}

const LayoutConfigContext = createContext<LayoutConfigContextInterface>(undefined as any);

export function useLayoutConfigContext(): LayoutConfigContextInterface {
  return useContext(LayoutConfigContext);
}

export function LayoutConfigProvider({ children }: PropsWithChildren): JSX.Element {
  const [config, setConfig] = useState<LayoutConfig>({});

  return <LayoutConfigContext.Provider value={{ config, setConfig }}>{children}</LayoutConfigContext.Provider>;
}
