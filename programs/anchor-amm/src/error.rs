use anchor_lang::prelude::*;
use constant_product_curve::CurveError;

#[error_code]
pub enum AmmError {
    #[msg("Pool is locked!")]
    PoolLocked,
    #[msg("Pool is already unlocked!")]
    PoolUnLocked,
    #[msg("Invalid amount!")]
    InvalidAmount,
    #[msg("Exceeded the slippage amount!")]
    SlippageExceeded,
    #[msg("Error in constant curve!")]
    ConstantCurveError,
    #[msg("Insufficient Balance!")]
    InsufficientBalance,
    #[msg("Unauthorized!")]
    UnAuthorized,
}

impl From<CurveError> for AmmError {
    fn from(error: CurveError) -> AmmError {
        match error {
            CurveError::InvalidPrecision => AmmError::InvalidAmount,
            CurveError::Overflow => AmmError::InvalidAmount,
            CurveError::Underflow => AmmError::InvalidAmount,
            CurveError::InvalidFeeAmount => AmmError::InvalidAmount,
            CurveError::InsufficientBalance => AmmError::InsufficientBalance,
            CurveError::ZeroBalance => AmmError::InvalidAmount,
            CurveError::SlippageLimitExceeded => AmmError::SlippageExceeded,
        }
    }
}
