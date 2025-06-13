from vocab_utils import compute_readability

# Test case 1: All words unknown (status = 0)
words_unknown = [{'status': 0, 'ignored': False} for _ in range(100)]
score_unknown = compute_readability(words_unknown)
print(f"All unknown words (should be 0.0%): {score_unknown:.1f}%")

# Test case 2: All words fully known (status = 6)
words_known = [{'status': 6, 'ignored': False} for _ in range(100)]
score_known = compute_readability(words_known)
print(f"All known words (should be 100.0%): {score_known:.1f}%")

# Test case 3: Mixed statuses
mixed_words = [
    {'status': 0, 'ignored': False},  # 0.0
    {'status': 1, 'ignored': False},  # 0.1
    {'status': 2, 'ignored': False},  # 0.25
    {'status': 3, 'ignored': False},  # 0.45
    {'status': 4, 'ignored': False},  # 0.7
    {'status': 5, 'ignored': False},  # 0.9
    {'status': 6, 'ignored': False},  # 1.0
    {'status': 0, 'ignored': True},   # ignored
    {'status': 6, 'ignored': True},   # ignored
]
score_mixed = compute_readability(mixed_words)
print(f"Mixed statuses (should be ~48.6%): {score_mixed:.1f}%")

# Test case 4: Empty list (should handle gracefully)
score_empty = compute_readability([])
print(f"Empty list (should be 100.0%): {score_empty:.1f}%")
