import { act } from '@testing-library/react';

jest.mock('../../Main.app2', () => ({
  __esModule: true,
  default: function MainApp2() {
    return <div data-testid="main-app2" />;
  },
}));

describe('index-app2 entry', () => {
  it('mounts MainApp2 on #root', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    act(() => {
      jest.isolateModules(() => {
        require('../../index-app2');
      });
    });
    expect(document.getElementById('root')).toBe(root);
  });
});
