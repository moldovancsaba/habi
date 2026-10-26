import { redirect } from "next/navigation";

export default function Home() {
  redirect("/legacy/index.html");
}
