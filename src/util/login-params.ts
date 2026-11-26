// Query parameters a page start reads as a login or a session. A return URL built for or taken from someone else must
// not carry them, or the return page could sign the user in to a foreign wallet or apply a foreign session.
export const LOGIN_PARAMS = ['session', 'address', 'signature', 'pubkey', 'code', 'otp', 'user', 'mail'];
