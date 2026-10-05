import { AuthForm } from "@/components/auth-form";
export default function Login() {
  return (
    <AuthForm
      demo={
        process.env.ALLOW_DEMO_LOGIN === "true" &&
        process.env.NODE_ENV !== "production"
      }
    />
  );
}
