import { UpdateType } from "@powersync/web";

const WRITABLE_TABLES = new Set([
  "courses",
  "modules",
  "lessons",
  "review_cards",
  "resources"
]);

export class SupabasePowerSyncConnector {
  constructor({ supabase, endpoint }) {
    this.supabase = supabase;
    this.endpoint = endpoint;
  }

  async fetchCredentials() {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error("É necessário entrar na conta Supabase.");
    return {
      endpoint: this.endpoint,
      token: data.session.access_token
    };
  }

  async uploadData(database) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const { data, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = data.session?.user;
    if (!user) throw new Error("Sessão Supabase ausente durante o envio.");

    try {
      for (const operation of transaction.crud) {
        if (!WRITABLE_TABLES.has(operation.table)) {
          throw new Error("Tabela não autorizada para upload: " + operation.table);
        }

        const table = this.supabase.from(operation.table);
        let result;

        if (operation.op === UpdateType.PUT) {
          const record = {
            ...(operation.opData || {}),
            id: operation.id,
            user_id: user.id
          };
          result = await table.upsert(record, { onConflict: "id" });
        } else if (operation.op === UpdateType.PATCH) {
          result = await table
            .update({ ...(operation.opData || {}), user_id: user.id })
            .eq("id", operation.id)
            .eq("user_id", user.id);
        } else if (operation.op === UpdateType.DELETE) {
          result = await table
            .delete()
            .eq("id", operation.id)
            .eq("user_id", user.id);
        } else {
          throw new Error("Operação PowerSync desconhecida: " + operation.op);
        }

        if (result.error) throw result.error;
      }

      await transaction.complete();
    } catch (error) {
      // Do not complete failed transactions: PowerSync must retain them for retry.
      throw error;
    }
  }
}
