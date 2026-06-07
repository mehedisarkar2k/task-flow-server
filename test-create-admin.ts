import { auth } from './src/config/auth';

async function run() {
  try {
    const response = await auth.api.signUpEmail({
      body: {
        email: "admin@taskflow.com",
        password: "securepassword",
        name: "System Admin",
        role: "ADMIN"
      }
    });
    console.log("Success:", response);
  } catch (error) {
    console.error("Failed:", error);
  }
}

run();
