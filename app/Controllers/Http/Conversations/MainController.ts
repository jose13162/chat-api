import { HttpContextContract } from "@ioc:Adonis/Core/HttpContext";
import Database from "@ioc:Adonis/Lucid/Database";
import { Conversation } from "App/Models";
import Ws from "App/Services/Ws";
import { StoreValidator } from "App/Validators/Conversations";

export default class MainController {
  public async index({ request, response, auth }: HttpContextContract) {
    let { page, perPage } = request.qs();

    if (!page || !perPage) {
      return response.badRequest();
    }

    const conversations = await Conversation.query()
      .where({ user_id_one: auth.user!.id })
      .orWhere({ user_id_two: auth.user!.id })
      .orderBy("latest_message_at", "desc")
      .paginate(page, perPage);

    const queries = conversations
      .toJSON()
      .data.map(async (conversation: Conversation) => {
        await conversation.load("userOne", (query) => {
          query.whereNot({ id: auth.user!.id });
          query.preload("avatar");
        });
        await conversation.load("userTwo", (query) => {
          query.whereNot({ id: auth.user!.id });
          query.preload("avatar");
        });

        const latestMessage = await conversation
          .related("messages")
          .query()
          .orderBy("created_at", "desc")
          .first();

        const friendship = [
          await Database.query()
            .from("friendships")
            .where({
              user_id: conversation.userIdOne,
              friend_id: conversation.userIdTwo
            })
            .first(),
          await Database.query()
            .from("friendships")
            .where({
              user_id: conversation.userIdTwo,
              friend_id: conversation.userIdOne
            })
            .first()
        ].every((condition) => condition);

        if (latestMessage) {
          await latestMessage.load("owner", (owner) => {
            owner.preload("avatar");
          });

          if (latestMessage.category === "media") {
            await latestMessage.load("media");
          }
        }

        conversation.$extras.friendship = !!friendship;
        conversation.$extras.latestMessage = latestMessage;
        conversation.$extras.user =
          conversation.userOne || conversation.userTwo;

        const conversationInJSON = conversation.toJSON();

        delete conversationInJSON["userOne"];
        delete conversationInJSON["userTwo"];

        return conversationInJSON;
      });

    const conversationsInJSON = conversations.toJSON();

    conversationsInJSON.data = await Promise.all(queries);

    return conversationsInJSON;
  }

  public async store({ request, response, auth }: HttpContextContract) {
    const { userId } = await request.validate(StoreValidator);
    const user = auth.user!;

    const existingConversation = await Database.query()
      .from("conversations")
      .where({ user_id_one: user.id, user_id_two: userId })
      .orWhere({ user_id_one: userId, user_id_two: user.id })
      .first();

    const friendship = [
      await Database.query()
        .from("friendships")
        .where({ user_id: user.id, friend_id: userId })
        .first(),
      await Database.query()
        .from("friendships")
        .where({ user_id: userId, friend_id: user.id })
        .first()
    ].every((condition) => condition);

    if (!friendship) {
      return response.status(400).json({
        errors: [
          {
            rule: "exists",
            target: "friendship"
          }
        ]
      });
    }

    if (existingConversation) {
      return response.status(400).json({
        errors: [
          {
            rule: "unique",
            target: "conversation",
            conversationId: existingConversation.id
          }
        ]
      });
    }

    const conversation = await Conversation.create({
      userIdOne: user.id,
      userIdTwo: userId
    });

    await conversation.load("userTwo", (user) => {
      user.preload("avatar");
    });

    await conversation.load("userOne", (user) => {
      user.preload("avatar");
    });

    conversation.$extras.friendship = !!friendship;

    conversation.$extras.user =
      conversation.userIdOne === user.id
        ? conversation.userTwo
        : conversation.userOne;

    const { userOne, userTwo } = conversation;

    const userOneConversation = {
      id: conversation.id,
      userIdOne: conversation.userIdOne,
      userIdTwo: conversation.userIdTwo,
      user: userTwo
    };

    const useTwoConversation = {
      id: conversation.id,
      userIdOne: conversation.userIdOne,
      userIdTwo: conversation.userIdTwo,
      user: userOne
    };

    Ws.io.to(`user-${userOne.id}`).emit("newConversation", userOneConversation);

    Ws.io.to(`user-${userTwo.id}`).emit("newConversation", useTwoConversation);

    const conversationInJSON = conversation.toJSON();

    delete conversationInJSON["userOne"];
    delete conversationInJSON["userTwo"];

    return conversationInJSON;
  }

  public async show({ response, params, auth }: HttpContextContract) {
    const conversation = await Conversation.findOrFail(params.id);

    if (
      ![conversation.userIdOne, conversation.userIdTwo].includes(auth.user!.id)
    ) {
      return response.badRequest();
    }

    const friendship = [
      await Database.query()
        .from("friendships")
        .where({
          user_id: conversation.userIdOne,
          friend_id: conversation.userIdTwo
        })
        .first(),
      await Database.query()
        .from("friendships")
        .where({
          user_id: conversation.userIdTwo,
          friend_id: conversation.userIdOne
        })
        .first()
    ].every((condition) => condition);

    await conversation.load("userOne", (query) => {
      query.whereNot({ id: auth.user!.id });
      query.preload("avatar");
    });

    await conversation.load("userTwo", (query) => {
      query.whereNot({ id: auth.user!.id });
      query.preload("avatar");
    });

    const latestMessage = await conversation
      .related("messages")
      .query()
      .orderBy("created_at", "desc")
      .first();

    if (latestMessage) {
      await latestMessage.load("owner");

      if (latestMessage.category === "media") {
        await latestMessage.load("media");
      }
    }

    conversation.$extras.latestMessage = latestMessage;
    conversation.$extras.friendship = !!friendship;

    const conversationInJSON = conversation.toJSON();

    conversationInJSON.user =
      conversationInJSON.userOne || conversationInJSON.userTwo;

    delete conversationInJSON["userOne"];
    delete conversationInJSON["userTwo"];

    return conversationInJSON;
  }
}
