import { PropsWithChildren, useRef } from 'react';
import { LayoutConfigProvider } from '../contexts/layout-config.context';
import { LayoutContextProvider } from '../contexts/layout.context';
import { Layout } from './layout';

export function LayoutWrapper({ children }: PropsWithChildren): JSX.Element {
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <LayoutContextProvider modalRootRef={modalRootRef} scrollRef={scrollRef} rootRef={rootRef}>
      <LayoutConfigProvider>
        <Layout>{children}</Layout>
      </LayoutConfigProvider>
    </LayoutContextProvider>
  );
}
