# Login Flow

## Student Login Process

1. Navigate to the student login page
2. Enter the teacher username
3. Select the student from the class roster
4. Click the password icons (order does not matter)
5. Submit to authenticate

## Password System

- Passwords consist of 1-3 icon selections
- Icon order is irrelevant (combination, not permutation)
- 18 available icons: rabbit, duck, fish, lizard, turtle, cat, dog, truck, rocket, train, plane, boat, strawberry, apple, carrot, banana, watermelon, spoon

## Cookie Management

- After successful login, cookies are saved to `data/cookies/{teacher}_{student}_{password}.json`
- Subsequent runs with the same credentials reuse saved cookies
- Expired cookies trigger automatic re-login

## Important Notes

- Do NOT navigate to the caregiver/parent login page
- If redirected to caregiver login, navigate back to student login
- The student login page uses icon-based password input, not text
