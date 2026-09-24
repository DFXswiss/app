/**
 * App 2.0 scoped class names.
 *
 * Feature stylesheets hash every class at build time so App 2.0 cannot
 * collide with the main app's utilities. html/body/:root stay global.
 * Jest's CSS-module proxy returns the original local name, so unit tests
 * that query `.spin` keep working.
 */

import base from './styles/base.module.css';
import login from './styles/login.module.css';
import buy from './styles/buy.module.css';
import account from './styles/account.module.css';
import transactions from './styles/transactions.module.css';
import walletConfirmation from './styles/wallet-confirmation.module.css';
import support from './styles/support.module.css';
import openCryptoPay from './styles/open-cryptopay.module.css';
import sharedControls from './styles/shared-controls.module.css';
import drawer from './styles/drawer.module.css';
import assetSheet from './styles/asset-sheet.module.css';
import toast from './styles/toast.module.css';
import { createCx, mergeStyleModules } from './css-classes';

const styleModules = [
  base,
  login,
  buy,
  account,
  transactions,
  walletConfirmation,
  support,
  openCryptoPay,
  sharedControls,
  drawer,
  assetSheet,
  toast,
];

// A local class can intentionally be used in more than one feature stylesheet.
// Keep every generated token so selectors within each module still match.
const s = mergeStyleModules(styleModules);

export default s;
export const cx = createCx(s, base);
