export class AppError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class NotImplementedError extends AppError {
  constructor(message: string) {
    super(message, 501);
  }
}
