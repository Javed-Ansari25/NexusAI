import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      // required: [true, "Chat ID is required"],
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for AI messages
    },

    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: [true, "Role is required"],
    },

    content: {
      type: String,
      required: [true, "Content is required"],
      maxlength: [20000, "Message too long"],
    },

    isError: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Fetch all messages for a chat in order
messageSchema.index({ chatId: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);