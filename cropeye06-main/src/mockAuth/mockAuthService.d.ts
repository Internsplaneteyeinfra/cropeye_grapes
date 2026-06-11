export type MockAuthUser = {
  phone_number: string;
  password: string;
  role: string;
  name: string;
};

export declare function mockLogin(
  phone_number: string,
  password: string
): MockAuthUser | null;

export declare function mockLogout(): void;

export declare function getMockUser(): MockAuthUser | null;
