import { Card } from "../components/UI";
export function Messages() {
  return (
    <Card>
      <h2>Connect</h2>
      <p>
        Find your training crew, send connection requests and message accepted
        connections.
      </p>
      <p>
        This is the fictional demo. Sign in with your GymMaster member account
        to use Connect. Your profile starts private.
      </p>
      <a className="primary" href="/#connect">
        Open member app
      </a>
    </Card>
  );
}
