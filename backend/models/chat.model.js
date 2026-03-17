import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },

    title: {
      type: String,
      default: "New Chat",
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },

    messageCount: {
      type: Number,
      default: 0,
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

// Compound index: fetch all chats of a user sorted by latest message
chatSchema.index({ userId: 1, lastMessageAt: -1 });

export const Chat = mongoose.model("Chat", chatSchema);