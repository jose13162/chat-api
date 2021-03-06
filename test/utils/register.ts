import Mail from "@ioc:Adonis/Addons/Mail";
import { User, UserKey } from "App/Models";
import faker from "faker";
import { Assert } from "japa/build/src/Assert";
import { request } from ".";

interface Payload {
  assert: Assert;
}

export default async ({ assert }: Payload) => {
  const email = faker.internet.email();

  Mail.trap((message) => {
    assert.deepEqual(message.to, [{ address: email }]);
    assert.deepEqual(message.from, {
      address: "contato@ChatApp.com",
      name: "ChatApp"
    });
    assert.deepEqual(message.subject, "Registro");
  });

  await request
    .post("/register")
    .send({
      email,
      redirectUrl: faker.internet.url()
    })
    .expect(200);

  Mail.restore();

  const user = await User.findByOrFail("email", email);
  const { key } = await UserKey.findByOrFail("userId", user.id);

  return { email, key };
};
