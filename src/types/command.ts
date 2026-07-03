import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface Command {
  data: {
    name: string;
    toJSON(): any;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
