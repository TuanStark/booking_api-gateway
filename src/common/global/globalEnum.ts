export enum HttpStatus {
    SUCCESS = 200,
    CREATED = 201,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    SERVER_ERROR = 500,
}

export enum HttpMessage {
    SUCCESS = 'Request processed successfully',
    CREATED = 'Resource created successfully',
    NOT_FOUND = 'Resource not found',
    SERVER_ERROR = 'Internal server error',
}
