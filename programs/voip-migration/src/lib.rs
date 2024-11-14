use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

declare_id!("Fc9w9m67Jk7rUXbCaguRAFVhNxLoQedf8FYkQf7SzLmm");

#[program]
pub mod voip_migration {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.state.admin = ctx.accounts.admin.key.clone();
        ctx.accounts.state.paused = false;

        Ok(())
    }

    pub fn migrate(ctx: Context<Migrate>, amount: u64) -> Result<()> {
        let _is_paused = ctx.accounts.state.paused;
        let _signer = ctx.accounts.admin.key.clone();
        let admin = ctx.accounts.state.admin;

        require!(!_is_paused, VIOPMigrationError::ContractPaused);
        require!(matches!(admin, _signer), VIOPMigrationError::Unauthorized);

        // prevent double spending
        if matches!(ctx.accounts.migration.claimed, true) {
            return err!(VIOPMigrationError::AccountAlreadyClaimed);
        }
        ctx.accounts.migration.claimed = true;

        let admin_ata = &mut ctx.accounts.admin_ata;
        let destination_ata = &mut ctx.accounts.destination_ata;
        let admin = &mut ctx.accounts.admin;
        let token_program = &ctx.accounts.token_program;

        // call transfer on token account
        let cpi_accounts = Transfer {
            from: admin_ata.to_account_info(),
            to: destination_ata.to_account_info(),
            authority: admin.to_account_info(),
        };
        let cpi_program = token_program.to_account_info();
        transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        Ok(())
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let _is_paused = ctx.accounts.state.paused;
        let _signer = ctx.accounts.admin.key.clone();
        let admin = ctx.accounts.state.admin;

        require!(!_is_paused, VIOPMigrationError::ContractPaused);
        require!(matches!(admin, _signer), VIOPMigrationError::Unauthorized);

        ctx.accounts.state.paused = true;

        msg!("VOIP Migration Contract Paused");

        Ok(())
    }

    pub fn un_pause(ctx: Context<UnPause>) -> Result<()> {
        let _is_paused = ctx.accounts.state.paused;
        let _signer = ctx.accounts.admin.key.clone();
        let admin = ctx.accounts.state.admin;

        require!(_is_paused, VIOPMigrationError::ContractNotPaused);
        require!(matches!(admin, _signer), VIOPMigrationError::Unauthorized);

        ctx.accounts.state.paused = false;

        msg!("VOIP Migration Contract Unpaused");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
        seeds = [b"state"],
        bump,
        payer = admin,
        space = 8 + State::LEN
    )]
    pub state: Account<'info, State>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Migrate<'info> {
    #[account(
        init,
        seeds = [b"migration", destination.key().as_ref()],
        bump,
        payer = admin,
        space = 8 + Migration::LEN
    )]
    pub migration: Account<'info, Migration>,

    #[account(mut)]
    pub state: Account<'info, State>,

    #[account(mut)]
    pub destination_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>, // the authority of the from account
    /// CHECK:
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnPause<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

// State
#[account]
pub struct Migration {
    current_index: u64,
    claimed: bool,
}

#[account]
pub struct State {
    admin: Pubkey,
    paused: bool,
}

impl Migration {
    const LEN: usize = 16 + 4;
}

impl State {
    const LEN: usize = 32 + 4;
}

#[error_code]
pub enum VIOPMigrationError {
    #[msg("Contract is paused")]
    ContractPaused,
    #[msg("Contract is not paused")]
    ContractNotPaused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Account already used to migrate token")]
    AccountAlreadyClaimed,
}
