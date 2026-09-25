/** Erreur métier dont le message peut être affiché tel quel à l'utilisateur. */
export class UserError extends Error {}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 403,
  ) {
    super(message);
  }
}
