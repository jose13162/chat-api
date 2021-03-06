import { Conversation, User } from "App/Models";
import { generateFriend } from ".";

interface Payload {
  user: User;
  amount: number;
}

export default async ({ user, amount }: Payload) => {
  const queries = Array(amount)
    .fill(false)
    .map(async () => {
      const { friend } = await generateFriend({ user });

      const conversation = await Conversation.create({
        userIdOne: user.id,
        userIdTwo: friend.id
      });

      return {
        id: conversation.id,
        userIdOne: conversation.userIdOne,
        userIdTwo: conversation.userIdTwo,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        latestMessageAt: conversation.latestMessageAt
      };
    });

  const conversations = await Promise.all(queries);

  return conversations as Conversation[];
};
