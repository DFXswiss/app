import { Outlet } from 'react-router-dom';
import { RealunitSectionNav } from './section-nav';

export function RealunitWorkspace(): JSX.Element {
  return (
    <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-6 text-left">
      <RealunitSectionNav />
      <Outlet />
    </div>
  );
}
