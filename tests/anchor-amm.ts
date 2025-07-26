import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmm } from "../target/types/anchor_amm";
import {
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("anchor-amm", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.anchorAmm as Program<AnchorAmm>;

  let mintX, mintY, configPda, lpMintPda, vaultX, vaultY;
  let userAtaX, userAtaY, lpUser;
  const seed = new anchor.BN(12345);
  const fee = 300;
  const authority = provider.wallet.publicKey;

  before(async () => {
    mintX = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6
    );

    mintY = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6
    );

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [lpMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    vaultX = getAssociatedTokenAddressSync(mintX, configPda, true);
    vaultY = getAssociatedTokenAddressSync(mintY, configPda, true);
    lpUser = getAssociatedTokenAddressSync(
      lpMintPda,
      provider.wallet.publicKey,
      true
    );
  });

  it("Initialize!", async () => {
    await program.methods
      .initialize(seed, fee, authority)
      .accountsPartial({
        initializer: provider.wallet.publicKey,
        mintX,
        mintY,
        lpTokenMint: lpMintPda,
        config: configPda,
        vaultX,
        vaultY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const configAccount = await program.account.config.fetch(configPda);

    expect(configAccount.seed.toNumber()).to.equal(seed.toNumber());
    expect(configAccount.fee).to.equal(fee);
    expect(configAccount.authority.toString()).to.equal(authority.toString());
    expect(configAccount.mintX.toString()).to.equal(mintX.toString());
    expect(configAccount.mintY.toString()).to.equal(mintY.toString());
    expect(configAccount.locked).to.equal(false);
  });

  it("Deposit!", async () => {
    userAtaX = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintX,
      provider.wallet.publicKey
    );

    userAtaY = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintY,
      provider.wallet.publicKey
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintX,
      userAtaX,
      provider.wallet.publicKey,
      1000000000 //minting 1k tokens
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintY,
      userAtaY,
      provider.wallet.publicKey,
      1000000000 //minting 1k tokens
    );

    const amount = new anchor.BN(100000000); //100 LP tokens (6 decimals)
    const maxX = new anchor.BN(200000000); //200
    const maxY = new anchor.BN(300000000); //300

    await program.methods
      .deposit(amount, maxX, maxY)
      .accountsPartial({
        user: provider.wallet.publicKey,
        mintX,
        mintY,
        config: configPda,
        lpTokenMint: lpMintPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
        lpUser,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // verify vault balances
    const vaultXAccount = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYAccount = await provider.connection.getTokenAccountBalance(
      vaultY
    );

    expect(Number(vaultXAccount.value.amount)).to.equal(maxX.toNumber());
    expect(Number(vaultYAccount.value.amount)).to.equal(maxY.toNumber());

    // verify lp tokens are minted
    const lpUserAccount = await provider.connection.getTokenAccountBalance(
      lpUser
    );

    expect(Number(lpUserAccount.value.amount)).to.equal(amount.toNumber());
  });

  it("Deposit liquidity (subsequent request)", async () => {
    const amount = new anchor.BN(50000000); //50 LP tokens we get
    const maxX = new anchor.BN(100000000); //100 (max X token we can deposit)
    const maxY = new anchor.BN(150000000); //150 (max Y token we can deposit)

    const lpUserBefore = await provider.connection.getTokenAccountBalance(
      lpUser
    );

    await program.methods
      .deposit(amount, maxX, maxY)
      .accountsPartial({
        user: provider.wallet.publicKey,
        mintX,
        mintY,
        config: configPda,
        lpTokenMint: lpMintPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
        lpUser,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const lpUserAfter = await provider.connection.getTokenAccountBalance(
      lpUser
    );

    const lpIncrease =
      Number(lpUserAfter.value.amount) - Number(lpUserBefore.value.amount);

    expect(lpIncrease).to.equal(amount.toNumber());
  });

  it("swaping X for Y tokens", async () => {
    const amount = new anchor.BN(10000000); //10 tokens;
    const min = new anchor.BN(1); // slippage protection (1 is the minimum we need else tx will fail)
    const isX = true;

    const userAtaXBefore = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYBefore = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const vaultXBefore = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYBefore = await provider.connection.getTokenAccountBalance(
      vaultY
    );

    await program.methods
      .swap(amount, isX, min)
      .accountsPartial({
        user: provider.wallet.publicKey,
        mintX,
        mintY,
        config: configPda,
        lpTokenMint: lpMintPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const userAtaXAfter = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYAfter = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const vaultXAfter = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYAfter = await provider.connection.getTokenAccountBalance(
      vaultY
    );

    // Verify user X tokens decreased
    const userXDecrease =
      Number(userAtaXBefore.value.amount) - Number(userAtaXAfter.value.amount);
    expect(userXDecrease).to.equal(amount.toNumber());

    // Verify user Y tokens increased
    const userYIncrease =
      Number(userAtaYAfter.value.amount) - Number(userAtaYBefore.value.amount);
    expect(userYIncrease).to.be.greaterThan(min.toNumber());

    // Verify vault X increased
    const vaultXIncrease =
      Number(vaultXAfter.value.amount) - Number(vaultXBefore.value.amount);
    expect(vaultXIncrease).to.equal(amount.toNumber());

    // Verify vault Y decreased
    const vaultYDecrease =
      Number(vaultYBefore.value.amount) - Number(vaultYAfter.value.amount);
    expect(vaultYDecrease).to.equal(userYIncrease);
  });

  it("swaping Y for X tokens", async () => {
    const amount = new anchor.BN(10000000); //10 tokens;
    const min = new anchor.BN(1); // slippage protection
    const isX = false;

    const userAtaXBefore = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYBefore = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const vaultXBefore = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYBefore = await provider.connection.getTokenAccountBalance(
      vaultY
    );

    await program.methods
      .swap(amount, isX, min)
      .accountsPartial({
        user: provider.wallet.publicKey,
        mintX,
        mintY,
        config: configPda,
        lpTokenMint: lpMintPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const userAtaXAfter = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYAfter = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const vaultXAfter = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYAfter = await provider.connection.getTokenAccountBalance(
      vaultY
    );

    // verify user Y tokens decreased
    const userYDecrease =
      Number(userAtaYBefore.value.amount) - Number(userAtaYAfter.value.amount);
    expect(userYDecrease).to.equal(amount.toNumber());

    // verify user X tokens increased
    const userXIncrease =
      Number(userAtaXAfter.value.amount) - Number(userAtaXBefore.value.amount);
    expect(userXIncrease).to.be.greaterThan(min.toNumber());

    // verify vault Y increased
    const vaultYIncrease =
      Number(vaultYAfter.value.amount) - Number(vaultYBefore.value.amount);
    expect(vaultYIncrease).to.equal(amount.toNumber());

    // verify vault X decreased
    const vaultXDecrease =
      Number(vaultXBefore.value.amount) - Number(vaultXAfter.value.amount);
    expect(vaultXDecrease).to.equal(userXIncrease);
  });

  it("withdraw", async () => {
    //  checking lp balance
    const lpBalanceBefore = await provider.connection.getTokenAccountBalance(
      lpUser
    );
    const lpAmount = new anchor.BN(25000000); //25 LP tokens
    const minX = new anchor.BN(1);
    const minY = new anchor.BN(1);

    // getting all balances before withdrawal
    const userAtaXBefore = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYBefore = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const vaultXBefore = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYBefore = await provider.connection.getTokenAccountBalance(
      vaultY
    );
    const lpSupplyBefore = await provider.connection.getTokenSupply(lpMintPda);

    try {
      await program.methods
        .withdraw(lpAmount, minX, minY)
        .accountsPartial({
          user: provider.wallet.publicKey,
          mintX,
          mintY,
          config: configPda,
          lpTokenMint: lpMintPda,
          vaultX,
          vaultY,
          userAtaX,
          userAtaY,
          lpUser,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      console.error("Withdraw failed:", error);
      throw error;
    }

    // balances after withdrawal
    const userAtaXAfter = await provider.connection.getTokenAccountBalance(
      userAtaX
    );
    const userAtaYAfter = await provider.connection.getTokenAccountBalance(
      userAtaY
    );
    const lpUserAfter = await provider.connection.getTokenAccountBalance(
      lpUser
    );
    const vaultXAfter = await provider.connection.getTokenAccountBalance(
      vaultX
    );
    const vaultYAfter = await provider.connection.getTokenAccountBalance(
      vaultY
    );
    const lpSupplyAfter = await provider.connection.getTokenSupply(lpMintPda);

    // changes
    const lpBurned =
      Number(lpBalanceBefore.value.amount) - Number(lpUserAfter.value.amount);
    const userXIncrease =
      Number(userAtaXAfter.value.amount) - Number(userAtaXBefore.value.amount);
    const userYIncrease =
      Number(userAtaYAfter.value.amount) - Number(userAtaYBefore.value.amount);
    const vaultXDecrease =
      Number(vaultXBefore.value.amount) - Number(vaultXAfter.value.amount);
    const vaultYDecrease =
      Number(vaultYBefore.value.amount) - Number(vaultYAfter.value.amount);
    const lpSuppyDiff =
      Number(lpSupplyBefore.value.amount) - Number(lpSupplyAfter.value.amount);

    // verfy LP tokens were burned
    expect(lpBurned).to.equal(lpAmount.toNumber());

    // verify user received tokens
    expect(userXIncrease).to.greaterThanOrEqual(minX.toNumber());
    expect(userYIncrease).to.greaterThanOrEqual(minY.toNumber());

    // verify tokens are deducted from vault
    expect(vaultXDecrease).to.equal(userXIncrease);
    expect(vaultYDecrease).to.equal(userYIncrease);

    // verify LP supply has changed(decreased)
    expect(lpSuppyDiff).to.equal(lpAmount.toNumber());
  });

  it("lock the pool", async () => {
    // calling lock method
    await program.methods
      .lock()
      .accountsPartial({
        user: provider.wallet.publicKey,
        config: configPda,
      })
      .rpc();

    const poolLockStateAfter = (await program.account.config.fetch(configPda))
      .locked;

    // state need to be true as the pool is locked
    expect(poolLockStateAfter).to.equal(true);
  });

  it("unlock the pool", async () => {
    await program.methods
      .unlock()
      .accountsPartial({
        user: provider.wallet.publicKey,
        config: configPda,
      })
      .rpc();

    const poolLockStateAfter = (await program.account.config.fetch(configPda))
      .locked;

    // state need to be false as the pool is unlocked
    expect(poolLockStateAfter).to.equal(false);
  });
});
