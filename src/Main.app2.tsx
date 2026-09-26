import { DfxContextProvider } from '@dfx.swiss/react';
import App2 from './app2/App';
// Keep App 2.0 styles in the entry's side-effect graph even when cx() calls are removed.
import './app2/css';

function MainApp2() {
  return (
    <DfxContextProvider api={{}} data={{}} includePrivateAssets={true}>
      <App2 />
    </DfxContextProvider>
  );
}

export default MainApp2;
