import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import { BN } from "bn.js";
import { VoipMigration } from "../target/types/voip_migration";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Signer, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo, transfer, TOKEN_PROGRAM_ID, Account, } from '@solana/spl-token';

const TestProgram = async() => {
  console.log("-------------------------------SET UP BEGIN-----------------------------------");
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.VoipMigration as Program<VoipMigration>;

  const user = Keypair.generate();
  const mint = Keypair.generate();
  const admin = Keypair.generate();
  const adminSig: Signer = {
    publicKey: admin.publicKey,
    secretKey: admin.secretKey
  }

  await program.provider.connection.confirmTransaction(
    await program.provider.connection.requestAirdrop(
      admin.publicKey,
      3 * LAMPORTS_PER_SOL
    ),
    "confirmed"
  );

  await program.provider.connection.confirmTransaction(
    await program.provider.connection.requestAirdrop(
      program.programId,
      3 * LAMPORTS_PER_SOL
    ),
    "confirmed"
  );

  await program.provider.connection.confirmTransaction(
    await program.provider.connection.requestAirdrop(
      mint.publicKey,
      3 * LAMPORTS_PER_SOL
    ),
    "confirmed"
  );

  await program.provider.connection.confirmTransaction(
    await program.provider.connection.requestAirdrop(
      user.publicKey,
      3 * LAMPORTS_PER_SOL
    ),
    "confirmed"
  );

  const STATE_SEED = "state";
  const MIGRATION_SEED = "migration";

  const [state, _a] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(STATE_SEED),
    ],
    
    program.programId
  );

  const [migrationPDA, _b] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(MIGRATION_SEED),
      user.publicKey.toBuffer()
    ],
    program.programId
  )

  console.log("-------------------------------SET UP COMPLETE-----------------------------------");
  console.log("-----------------------USER SOL ADDRESS: ", user.publicKey.toBase58());
  console.log("-----------------------ADMIN ADDRESS: ", admin.publicKey.toBase58());
  console.log("-----------------------ADMIN PRIVATE KEY: ", admin.secretKey.toString());
  console.log("-----------------------PROGRAM ID: ", program.programId.toBase58());

  console.log("-------------------------------INITIALIZATION BEGIN-----------------------------------");
  const info = await program.provider.connection.getAccountInfo(state);
  if (!info) {
    console.log("  State not found. Initializing Program...");

    const initContext = {
      state: state,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    };

    const initTxHash = await program.methods.initialize().accounts(initContext).signers([adminSig]).rpc();
    await program.provider.connection.confirmTransaction(initTxHash, "finalized");
    console.log("Initialize transaction signature", initTxHash);

    const newInfo = await program.provider.connection.getAccountInfo(state);
    assert(newInfo, "  Mint should be initialized.");

  } else {    
    // Do not attempt to initialize if already initialized
    console.log("  State already found.");
    console.log("  State Address: ", state.toBase58());
  }
  console.log("-------------------------------INITIALIZATION COMPLETE-----------------------------------");

  console.log("-------------------------------PAUSE BEGIN-----------------------------------");
  const pauseContext = {
    state: state,
    admin: admin.publicKey,
  };

  const pauseTxHash = await program.methods.pause().accounts(pauseContext).signers([adminSig]).rpc();
  await program.provider.connection.confirmTransaction(pauseTxHash, "finalized");
  console.log("Pause transaction signature", pauseTxHash);

  console.log("-------------------------------PAUSE COMPLETE-----------------------------------");

  console.log("-------------------------------UN-PAUSE BEGIN-----------------------------------");
  const unPauseContext = {
    state: state,
    admin: admin.publicKey,
  };

  const unPauseTxHash = await program.methods.unPause().accounts(unPauseContext).signers([adminSig]).rpc();
  await program.provider.connection.confirmTransaction(unPauseTxHash, "finalized");
  console.log("Unpause transaction signature", unPauseTxHash);

  console.log("-------------------------------UN-PAUSE COMPLETE-----------------------------------");

  console.log("-------------------------------MIGRATE BEGIN-----------------------------------");
  const connection = new Connection(
    'http://127.0.0.1:8899', "confirmed"
  )

  // create test token
  const token = await createMint(
    connection,
    mint,
    mint.publicKey,
    null,
    9
  );

  console.log("------------------------------TOKEN MINT ADDRESS: ", token.toBase58());

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mint,
    token,
    mint.publicKey
  )

  await mintTo(
    connection,
    mint,
    token,
    tokenAccount.address,
    mint,
    1000 * 10 ** 9 // mint 1000
  )

  const destinationAta = await getOrCreateAssociatedTokenAccount(connection, admin, token, user.publicKey);
  const adminAta = await getOrCreateAssociatedTokenAccount(connection, admin, token, admin.publicKey, true);
  
  // transfer token to admin account
  await transfer(
    connection,
    mint,
    tokenAccount.address,
    adminAta.address,
    mint.publicKey,
    100 * 10 ** 9 
  );

  const migrateContext = {
    migration: migrationPDA,
    state: state,
    destinationAta: destinationAta.address,
    adminAta: adminAta.address,
    admin: admin.publicKey,
    destination: user.publicKey,
    mint: token,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID
  };
  const migrateAmount = 1 * 10 ** 9;
  
  const migrationState = await program.provider.connection.getAccountInfo(migrationPDA);
  console.log("migration state: ", migrationState)
  if (!migrationState) {
    const migrateTxHash = await program.methods.migrate(new BN(migrateAmount)).accounts(migrateContext).signers([adminSig]).rpc();
    await program.provider.connection.confirmTransaction(migrateTxHash, "finalized");
    console.log("Migrate transaction signature", migrateTxHash);
  } else {
    console.log("Account already claimed")
  }

  console.log("-------------------------------MIGRATE COMPLETE-----------------------------------");
};

const runTest = async () => {
  try {
    await TestProgram();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

runTest()
