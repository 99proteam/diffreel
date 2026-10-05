from statistics import fmean


def average(numbers: list[float]) -> float:
    """Return the mean of numbers, or 0.0 for an empty list."""
    if not numbers:
        return 0.0
    return fmean(numbers)
