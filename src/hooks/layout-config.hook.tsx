import { isEqual } from 'lodash';
import { useLayoutEffect, useRef } from 'react';
import { LayoutConfig, useLayoutConfigContext } from '../contexts/layout-config.context';

export function useLayoutOptions({
  title,
  backButton,
  textStart,
  noPadding,
  noHeader,
  noMaxWidth,
  smallMenu,
  onBack,
}: LayoutConfig): void {
  const { setConfig } = useLayoutConfigContext();
  const prevConfig = useRef<LayoutConfig>();
  const onBackRef = useRef(onBack);
  const stableOnBack = useRef(() => onBackRef.current?.());
  onBackRef.current = onBack;

  useLayoutEffect(() => {
    const newConfig: LayoutConfig = {
      title,
      backButton,
      textStart,
      noPadding,
      noHeader,
      noMaxWidth,
      smallMenu,
      onBack: onBack === undefined ? undefined : stableOnBack.current,
    };

    const changed = !isEqual(
      { ...prevConfig.current, onBack: Boolean(prevConfig.current?.onBack) },
      { ...newConfig, onBack: Boolean(newConfig.onBack) },
    );

    if (changed) {
      prevConfig.current = newConfig;
      setConfig(newConfig);
    }
  }, [title, backButton, textStart, noPadding, noHeader, noMaxWidth, smallMenu, onBack, setConfig]);

  useLayoutEffect(() => {
    return () => setConfig({});
  }, [setConfig]);
}
