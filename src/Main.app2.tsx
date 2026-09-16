import { DfxContextProvider } from '@dfx.swiss/react';
import App2 from './app2/App';
import './app2/styles.module.css';

function MainApp2() {
  return (
    <DfxContextProvider api={{}} data={{}}>
      <App2 />
    </DfxContextProvider>
  );
}

export default MainApp2;
